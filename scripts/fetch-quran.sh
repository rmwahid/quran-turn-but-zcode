#!/bin/sh
# Re-fetch the canonical Qur'an text and metadata from tanzil.net.
# Running this means you accept Tanzil's Terms of Use: https://tanzil.net/docs/Text_License
# (verbatim copies only, CHANGING THE TEXT IS NOT ALLOWED, attribution + link to tanzil.net).
#
# Options are Tanzil's download-form defaults for Uthmani:
#   pause marks: on · sajdah signs: on · rub-el-hizb: off · tatweel below superscript alef: on
# Output format txt-2 = "sura|aya|text" per line.
#
# After fetching, run `npm run verify`. If Tanzil published a new version the checksum
# will change: review https://tanzil.net/updates/ before updating data/SHA256SUMS
# and QURAN_SHA256 in app/config.js.
set -eu
cd "$(dirname "$0")/.."
curl -fsSL -o data/quran-uthmani.txt \
  'https://tanzil.net/pub/download/index.php?marks=true&sajdah=true&tatweel=true&quranType=uthmani&outType=txt-2&agree=true'
curl -fsSL -o data/quran-data.js 'https://tanzil.net/res/text/metadata/quran-data.js'
shasum -a 256 data/quran-uthmani.txt data/quran-data.js
