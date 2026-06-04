param(
  [string]$Label = "tail-load",
  [int]$SleepSeconds = 2
)

$i = 0
while ($true) {
  $i += 1
  Write-Host ("TAIL_LOAD label={0} tick={1} time={2}" -f $Label, $i, (Get-Date -Format o))
  1..50 | ForEach-Object {
    Write-Host ("load-line={0:D4} payload={1} cwd=D:\LucasCore\repo" -f $_, ("x" * 80))
  }
  Write-Host ("gpt-5.5 medium - D:\Lucas Core v0.1\workspaces\ceo\repo     Pursuing goal load-test label={0}" -f $Label)
  Start-Sleep -Seconds $SleepSeconds
}
