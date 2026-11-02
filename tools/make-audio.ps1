$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$jsonPath = Join-Path $root "narration.json"
$outDir = Join-Path (Split-Path -Parent $root) "deliverables\audio"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$raw = [System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8)
$sections = $raw | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft Huihui Desktop")
$synth.Rate = 0
$synth.Volume = 100

foreach ($s in $sections) {
  $file = Join-Path $outDir ("sec{0}.wav" -f $s.id)
  $synth.SetOutputToWaveFile($file)
  $synth.Speak($s.text)
  $synth.SetOutputToNull()
  Write-Output ("{0} {1}" -f $s.id, $file)
}
$synth.Dispose()
