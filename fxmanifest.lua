fx_version 'cerulean'
game 'gta5'

name '3d-audio'
description '3D positional audio for FiveM — arbitrary audio files spatialized through Web Audio / Howler.js'
author 'Northdegree, Julscha'
version '1.0.0'
repository 'https://github.com/HeartC-O-R-E/3D-Audio-Subsystem'

server_script 'dist/server/index.js'
client_script 'dist/client/index.js'

ui_page 'dist/web/index.html'
files {
    'dist/web/**/*',
    'assets/sounds/**/*',
}
