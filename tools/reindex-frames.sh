#!/bin/zsh
# Extract 60 frames from the spin video and rotate the ordering so the given
# source-frame index becomes frame 1 (the scrub's starting, front-facing view).
# usage: tools/reindex-frames.sh <front_index_0based>
set -e
cd "$(dirname "$0")/.."
FRONT=${1:?usage: reindex-frames.sh <front_index_0based>}
TMP=$(mktemp -d)
ffmpeg -v error -i assets/raw/spin.mp4 -vf "select='not(mod(n\,2))',scale=720:-2" -vsync vfr -frames:v 60 -q:v 4 -y "$TMP/s%02d.jpg"
rm -f public/frames/*.jpg
for i in {0..59}; do
  src=$(( (i + FRONT) % 60 + 1 ))
  dst=$(( i + 1 ))
  cp "$TMP/s$(printf %02d $src).jpg" "public/frames/f$(printf %02d $dst).jpg"
done
rm -rf "$TMP"
echo "reindexed: source frame $FRONT is now f01"
ls public/frames | wc -l
