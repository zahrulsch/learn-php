#!/bin/bash
# Menjalankan semua contoh satu bab: PHPStan untuk file yang harus lulus, lalu tiap file, lalu tiap demo.
ch=$1

echo "########## PHPSTAN src/$ch (harus lulus)"
vendor/bin/phpstan analyse --no-progress "src/$ch"
echo "[phpstan exit=$?]"

for f in src/$ch/*.php; do
  echo
  echo "########## RUN $f"
  php "$f"
  echo "[exit=$?]"
done

for f in demo/$ch/*.php; do
  [ -e "$f" ] || continue
  echo
  echo "########## DEMO $f"
  vendor/bin/phpstan analyse --no-progress --error-format=raw "$f"
  echo "[phpstan exit=$?]"
  if ! grep -qx "$(basename "$f")" "demo/$ch/.norun"; then
    php "$f"
    echo "[exit=$?]"
  fi
done

echo
echo "########## PHPSTAN seluruh src (composer check)"
vendor/bin/phpstan analyse --no-progress
echo "[phpstan exit=$?]"
