#!/bin/sh
# Veritrace — installation pour l'utilisateur courant (Linux, macOS).
# Copie le binaire dans ~/.local/bin (ou le dossier passé en argument).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
dest=${1:-"$HOME/.local/bin"}
[ -f "$here/veritrace" ] || { echo "veritrace introuvable à côté de ce script." >&2; exit 1; }
mkdir -p "$dest"
cp "$here/veritrace" "$dest/veritrace"
chmod 755 "$dest/veritrace"
if [ "$(uname)" = "Darwin" ]; then
    # Binaire non signé téléchargé : retirer l'attribut de quarantaine de Gatekeeper.
    xattr -d com.apple.quarantine "$dest/veritrace" 2>/dev/null || true
fi
case ":$PATH:" in
    *":$dest:"*) ;;
    *) echo "Ajoutez $dest à votre PATH (ex. : echo 'export PATH=\"$dest:\$PATH\"' >> ~/.profile)";;
esac
"$dest/veritrace" --version
echo "Installation terminée. Vérifiez avec : veritrace selftest   puis : veritrace doctor"
