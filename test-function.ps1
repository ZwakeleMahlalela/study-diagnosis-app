# Fill these in with your own values before running
$SUPABASE_URL = "https://uxnldchxaeflihowpxkl.supabase.co"
$ANON_KEY = "sb_publishable_WeFoU284NoH4i_fIcOxnTg_stZVRxpj"
$PDF_PATH = "C:\Users\Zwakele\Downloads\Topic 1 - LAN Security Concepts - SRWE Module 10 - Slides Only.pdf"

# Read the PDF and convert it to base64
$bytes = [IO.File]::ReadAllBytes($PDF_PATH)
$base64 = [Convert]::ToBase64String($bytes)

# Build the request body
$body = @{ pdfBase64 = $base64 } | ConvertTo-Json -Compress

# Call the deployed Edge Function
$response = Invoke-RestMethod `
  -Uri "$SUPABASE_URL/functions/v1/generate-question" `
  -Method Post `
  -Headers @{
      "Authorization" = "Bearer $ANON_KEY"
      "apikey"        = "$ANON_KEY"
      "Content-Type"  = "application/json"
  } `
  -Body $body

# Print the full response so we can see debug info if something went wrong
$response | ConvertTo-Json -Depth 10