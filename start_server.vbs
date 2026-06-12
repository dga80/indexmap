Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\34616\Desktop\AppsDani_\IndexMap"
WshShell.Run "cmd /c node server.js", 0, False
WScript.Sleep 1000
WshShell.Run "cmd /c start http://localhost:3080", 0, False
