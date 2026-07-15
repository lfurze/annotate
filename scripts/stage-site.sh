#!/bin/sh
set -eu

mkdir -p _site
cp -R index.html assets css js vendor _site/
cp LICENSE NOTICE PRIVACY.md SECURITY.md _site/
cp deploy/_headers _site/_headers
touch _site/.nojekyll
