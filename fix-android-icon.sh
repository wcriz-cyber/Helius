#!/bin/bash
# ════════════════════════════════════════════════════════
# fix-android-icon.sh
# Copia icon.png a todos los mipmap de Android para APK
# Usar en GitHub Actions ANTES de "npx cap build android"
# Requiere ImageMagick (sudo apt-get install imagemagick)
# ════════════════════════════════════════════════════════

set -e

ICON_SRC="icon.png"   # tu icono en la raíz del repo

if [ ! -f "$ICON_SRC" ]; then
  echo "❌ No se encontró $ICON_SRC en la raíz del repo"
  exit 1
fi

echo "✅ Usando icono: $ICON_SRC"

# Tamaños Android launcher icon (px)
declare -A SIZES=(
  ["mipmap-mdpi"]=48
  ["mipmap-hdpi"]=72
  ["mipmap-xhdpi"]=96
  ["mipmap-xxhdpi"]=144
  ["mipmap-xxxhdpi"]=192
)

ANDROID_RES="android/app/src/main/res"

for folder in "${!SIZES[@]}"; do
  size="${SIZES[$folder]}"
  dest="$ANDROID_RES/$folder"
  mkdir -p "$dest"

  # ic_launcher.png (normal)
  convert "$ICON_SRC" -resize "${size}x${size}" "$dest/ic_launcher.png"
  echo "  → $dest/ic_launcher.png (${size}px)"

  # ic_launcher_round.png (versión circular — Android 7.1+)
  convert "$ICON_SRC" \
    -resize "${size}x${size}" \
    \( +clone -threshold 50% -negate \
       -morphology Erode Disk:$((size/2-1)) \
       -negate \) \
    -alpha off \
    -compose CopyOpacity -composite \
    "$dest/ic_launcher_round.png" 2>/dev/null || \
    cp "$dest/ic_launcher.png" "$dest/ic_launcher_round.png"

  echo "  → $dest/ic_launcher_round.png"
done

# Foreground para adaptive icon (API 26+)
ADAPTIVE_FOREGROUND="$ANDROID_RES/mipmap-anydpi-v26"
mkdir -p "$ADAPTIVE_FOREGROUND"

# ic_launcher.xml — adaptive icon
cat > "$ANDROID_RES/mipmap-anydpi-v26/ic_launcher.xml" << 'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
XML

# ic_launcher_round.xml
cp "$ANDROID_RES/mipmap-anydpi-v26/ic_launcher.xml" \
   "$ANDROID_RES/mipmap-anydpi-v26/ic_launcher_round.xml"

# Foreground del adaptive icon (imagen principal sin fondo)
for folder in "${!SIZES[@]}"; do
  size="${SIZES[$folder]}"
  dest="$ANDROID_RES/$folder"
  # Foreground: 108dp = icono más pequeño centrado (66% del tamaño total)
  inner=$((size * 66 / 100))
  convert "$ICON_SRC" \
    -resize "${inner}x${inner}" \
    -gravity center \
    -background none \
    -extent "${size}x${size}" \
    "$dest/ic_launcher_foreground.png"
  echo "  → $dest/ic_launcher_foreground.png (${size}px foreground)"
done

# Color de fondo para adaptive icon
VALUES_DIR="$ANDROID_RES/values"
mkdir -p "$VALUES_DIR"
if ! grep -q "ic_launcher_background" "$VALUES_DIR/colors.xml" 2>/dev/null; then
  if [ -f "$VALUES_DIR/colors.xml" ]; then
    # Insertar antes del cierre </resources>
    sed -i 's|</resources>|    <color name="ic_launcher_background">#1A1A2E</color>\n</resources>|' "$VALUES_DIR/colors.xml"
  else
    cat > "$VALUES_DIR/colors.xml" << 'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#1A1A2E</color>
</resources>
XML
  fi
fi

echo ""
echo "✅ Íconos de Android generados correctamente"
echo "   El APK ahora usará icon.png del repositorio"
