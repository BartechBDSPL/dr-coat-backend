Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "E:\Bartech\WMS_BACKEND"
WshShell.Run "cmd /c pm2 start dist/bundle.js --name gerr-backend --node-args=--experimental-modules", 0, False
