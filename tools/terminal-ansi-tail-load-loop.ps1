param(
  [string]$Label = "ansi-load",
  [int]$SleepSeconds = 2
)

$esc = [char]27
$i = 0
while ($true) {
  $i += 1
  Write-Host ("{0}[36mANSI_LOAD label={1} tick={2} time={3}{0}[0m" -f $esc, $Label, $i, (Get-Date -Format o))
  1..36 | ForEach-Object {
    $color = if ($_ % 3 -eq 0) { "32" } elseif ($_ % 3 -eq 1) { "33" } else { "35" }
    Write-Host ("{0}[{1}mload-line={2:D4} payload={3} cwd=D:\LucasCore\repo{0}[0m" -f $esc, $color, $_, ("x" * 72))
  }
  Write-Host ("{0}[1;34mgpt-5.5 medium - D:\Lucas Core v0.1\workspaces\ceo\repo     Pursuing goal ansi-load label={1}{0}[0m" -f $esc, $Label)
  Start-Sleep -Seconds $SleepSeconds
}
