fx_version 'cerulean'
game 'gta5'

name 'hcrp-audio'
description '3D Positional Audio — shared audio API for HeartCORE outsourced systems'
author 'HeartCORE Team'
version '1.0.0'

server_script 'dist/server/index.js'
client_script 'dist/client/index.js'

ui_page 'dist/web/index.html'
files {
    'dist/web/**/*',
    'assets/sounds/**/*',
}

-- No dependency on heartCORE — intentionally standalone
