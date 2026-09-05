# Fill these in with your own values before running
$SUPABASE_URL = "https://uxnldchxaeflihowpxkl.supabase.co"
$ANON_KEY = "sb_publishable_WeFoU284NoH4i_fIcOxnTg_stZVRxpj"
$PDF_PATH = "C:\Users\Zwakele\Downloads\Topic 1 - LAN Security Concepts - SRWE Module 10 - Slides Only.pdf"

# Read the PDF and convert it to base64
$bytes = [IO.File]::ReadAllBytes($PDF_PATH)
$base64 = [Convert]::ToBase64String($bytes)

# The same question and Answer D from your validation spike —
# you already know the expected classification is "Partial"
$question = "MAC address spoofing attacks occur when the threat actors alter the MAC address of their host to match another known MAC address of a target host. Explain the process, including how the attacker sustains it."
$answer = "When a threat actor changes their MAC address to match the target host, the switch updates its MAC address table and sends traffic for that MAC address to the attacker's port. The attacker keeps sending frames because this causes the switch to repeatedly update the MAC address entry, ensuring that the target's traffic continues to be redirected to the attacker"

$body = @{
    pdfBase64 = $base64
    question  = $question
    answer    = $answer
} | ConvertTo-Json -Compress

$response = Invoke-RestMethod `
  -Uri "$SUPABASE_URL/functions/v1/grade-answer" `
  -Method Post `
  -Headers @{
      "Authorization" = "Bearer $ANON_KEY"
      "apikey"        = "$ANON_KEY"
      "Content-Type"  = "application/json"
  } `
  -Body $body

$response | ConvertTo-Json -Depth 10
