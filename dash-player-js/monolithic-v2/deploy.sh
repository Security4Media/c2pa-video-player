GS_PLAYER_V2="gs://ibc2025-c2pa-01/player-v2/"
gcloud storage rm -r "$GS_PLAYER_V2"
gcloud storage cp -r "./C2paPlayer-V2" "ibc_sony_c2pa_player.html" "assets" "c2pa-player.css" "ibc-2025-png.png" "c2pa-v2-monolithic-plugin.js" "$GS_PLAYER_V2"