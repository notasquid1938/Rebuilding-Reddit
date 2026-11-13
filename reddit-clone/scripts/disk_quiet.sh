#!/bin/sh
# Night-time cap on the database's use of the archive hard disk, for a disk
# within earshot of a bedroom. Run as root every few minutes by the systemd
# timer in scripts/systemd/: during QUIET_HOURS it limits how many reads and
# writes a second the database container may make on that disk; outside them
# it lifts the limit. Re-applying on every run picks up a recreated container.
# The website keeps serving at night, more slowly when crawlers are busy.
set -eu

CONTAINER=${CONTAINER:-reddit-rebuilt-db}
DISK=${DISK:-/media/ben-server/Jumbo}
QUIET_HOURS=${QUIET_HOURS:-23-8}
# The archive disk manages ~250 random reads a second flat out; 50 keeps it
# about 30% busy. The byte limits bound long sequential scans the same way
NIGHT_LIMIT=${NIGHT_LIMIT:-riops=50 wiops=50 rbps=20971520 wbps=20971520}
DAY_LIMIT='riops=max wiops=max rbps=max wbps=max'
CGROUP_ROOT=${CGROUP_ROOT:-/sys/fs/cgroup/system.slice}
HOUR=${HOUR:-$(date +%-H)}

# The whole disk behind the mount (io.max takes disks, not partitions)
if [ -z "${DEVICE:-}" ]; then
  source=$(findmnt -no SOURCE -T "$DISK")
  parent=$(lsblk -no PKNAME "$source" | head -n 1 | tr -d ' ')
  DEVICE=$(lsblk -dno MAJ:MIN "/dev/${parent:-${source#/dev/}}" | tr -d ' ')
fi

start=${QUIET_HOURS%-*}
end=${QUIET_HOURS#*-}
quiet=0
if [ "$start" -le "$end" ]; then
  if [ "$HOUR" -ge "$start" ] && [ "$HOUR" -lt "$end" ]; then quiet=1; fi
elif [ "$HOUR" -ge "$start" ] || [ "$HOUR" -lt "$end" ]; then
  quiet=1
fi
if [ "$quiet" = 1 ]; then limit=$NIGHT_LIMIT; else limit=$DAY_LIMIT; fi

id=$(docker inspect -f '{{.Id}}' "$CONTAINER")
file="$CGROUP_ROOT/docker-$id.scope/io.max"
before=$(cat "$file")
echo "$DEVICE $limit" > "$file"
# Log only changes, so the journal shows when the cap went on and off
if [ "$(cat "$file")" != "$before" ]; then
  echo "$CONTAINER on $DEVICE: $limit"
fi
