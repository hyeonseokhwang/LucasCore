$ErrorActionPreference = "Stop"

$vcvars = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path -LiteralPath $vcvars)) {
  throw "vcvars64.bat not found. Install Visual Studio Build Tools with C++ workload."
}

$command = "call `"$vcvars`" && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && cargo run --manifest-path apps/api/Cargo.toml"
cmd /c $command
