#!/bin/sh
# Updates the app on the server: pull the latest code, rebuild the image,
# restart the containers and verify that the app comes up healthy.
#
# Usage (on the server, from anywhere):
#   /opt/cis-tuinwerken/scripts/update-server.sh            # update if there are new commits
#   /opt/cis-tuinwerken/scripts/update-server.sh --force    # rebuild even without new commits
#
# The old containers keep running until the new image is built, so a failed
# build (e.g. a network hiccup) causes no downtime. Database and backups are
# not touched; migrations run automatically when the app container starts.
#
# Everything lives in main(), which is only called at the very end: sh then
# parses the whole script before running it, so `git pull` replacing this file
# mid-run is harmless.
set -eu

COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_TIMEOUT_SECONDS=180

# Runs a command up to $1 times, waiting 10 s between attempts. The server's
# network/DNS occasionally drops requests (GitHub, Docker Hub, npm registry).
retry() {
	max=$1
	shift
	attempt=1
	until "$@"; do
		if [ "$attempt" -ge "$max" ]; then
			return 1
		fi
		echo "⚠ Mislukt (poging $attempt/$max), opnieuw over 10 s…"
		attempt=$((attempt + 1))
		sleep 10
	done
}

compose() {
	docker compose -f "$COMPOSE_FILE" "$@"
}

main() {
	force=0
	case "${1:-}" in
	--force) force=1 ;;
	"") ;;
	*)
		echo "Gebruik: $0 [--force]"
		exit 2
		;;
	esac

	cd "$(dirname "$0")/.."

	if [ ! -f .env ]; then
		echo "✖ Geen .env gevonden in $(pwd) — zie .env.example en docs/deployment.md."
		exit 1
	fi

	# Local edits to tracked files would make `git pull` fail or silently diverge.
	if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
		echo "✖ Er zijn lokale wijzigingen op de server — update afgebroken:"
		git status --short --untracked-files=no
		echo "  Zet ze terug met 'git checkout -- <bestand>' of neem ze op in de repo."
		exit 1
	fi

	old=$(git rev-parse HEAD)
	echo "⏳ Nieuwe code ophalen…"
	if ! retry 3 git pull --ff-only --quiet; then
		echo "✖ Code ophalen mislukt — er is niets gewijzigd."
		exit 1
	fi
	new=$(git rev-parse HEAD)

	if [ "$old" = "$new" ] && [ "$force" -eq 0 ]; then
		echo "✔ Al up-to-date ($(git log -1 --format='%h %s'))."
		echo "  Opnieuw bouwen en herstarten? Gebruik --force."
		exit 0
	fi

	if [ "$old" != "$new" ]; then
		echo "Nieuwe commits:"
		git log --oneline "$old..$new"
	fi

	echo "🔨 Image bouwen…"
	if ! retry 3 compose build app; then
		echo "✖ Bouwen mislukt — de vorige versie draait nog gewoon verder."
		echo "  Probeer later opnieuw met: $0 --force"
		exit 1
	fi

	echo "🚀 Containers (her)starten…"
	compose up -d --remove-orphans

	echo "⏳ Wachten tot de app gezond is (max. ${HEALTH_TIMEOUT_SECONDS} s)…"
	container=$(compose ps -q app)
	waited=0
	status=starting
	while [ "$waited" -lt "$HEALTH_TIMEOUT_SECONDS" ]; do
		status=$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo unknown)
		[ "$status" = "healthy" ] && break
		sleep 5
		waited=$((waited + 5))
	done

	if [ "$status" != "healthy" ]; then
		echo "✖ De app is niet gezond geworden (status: $status). Laatste logregels:"
		compose logs app --tail 50
		echo "  Terug naar de vorige versie:"
		echo "    git reset --hard $old && docker compose -f $COMPOSE_FILE up -d --build"
		echo "  (Opgelet: databasemigraties van de nieuwe versie worden niet teruggedraaid.)"
		exit 1
	fi

	version=$(compose exec -T app node -p "require('./package.json').version" 2>/dev/null || echo "?")
	echo "🧹 Oude images opruimen…"
	docker image prune -f >/dev/null

	echo "✔ Update geslaagd: versie $version ($(git log -1 --format='%h %s'))."
	compose ps --format '{{.Service}}: {{.Status}}'
}

main "$@"
exit
