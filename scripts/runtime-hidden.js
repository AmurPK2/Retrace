// GUI-hosted launcher. Never detach an unowned console or run a terminal UI.
var shell = new ActiveXObject("WScript.Shell");
var root = new ActiveXObject("Scripting.FileSystemObject").GetParentFolderName(
  WScript.ScriptFullName
);
var command =
  '"' +
  shell.ExpandEnvironmentStrings("%SystemRoot%") +
  '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' +
  root +
  '\\runtime-host.ps1"';
var log = new ActiveXObject("Scripting.FileSystemObject").CreateTextFile(
  root + "\\..\\artifacts\\runtime-launch.log",
  true
);
log.WriteLine(new Date().toUTCString());
log.WriteLine(command);
log.Close();
var code = shell.Run(command, 0, true);
log = new ActiveXObject("Scripting.FileSystemObject").OpenTextFile(
  root + "\\..\\artifacts\\runtime-launch.log",
  8,
  true
);
log.WriteLine("Exit " + code);
log.Close();
WScript.Quit(code);
