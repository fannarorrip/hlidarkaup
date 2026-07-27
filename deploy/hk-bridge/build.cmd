@echo off
rem Byggir HK-bruna med innbyggda .NET Framework compilernum — engin verkfaeri thurfa.
rem Keyra i thessari moppu:  build.cmd
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /o /out:hk-bridge.exe ^
  /r:System.ServiceModel.dll /r:System.Runtime.Serialization.dll ^
  /r:System.IdentityModel.dll /r:System.Configuration.dll ^
  hk-bridge.cs HKProtectionLevel.cs
if exist hk-bridge.exe echo BUILD OK: hk-bridge.exe
