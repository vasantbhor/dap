Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = oWS.SpecialFolders("Desktop") & "\DepositPro.lnk"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "D:\workspace\deposit_management_system\Start_App.bat"
oLink.WorkingDirectory = "D:\workspace\deposit_management_system"
oLink.Description = "Launch DepositPro Management System Standalone"
oLink.WindowStyle = 7
oLink.Save
