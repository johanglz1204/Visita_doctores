Set WshShell = CreateObject("WScript.Shell")
' El 0 significa "oculto" (sin ventana), el false significa "no esperar a que termine"
WshShell.Run chr(34) & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\Iniciar_Servidor.bat" & Chr(34), 0, false
