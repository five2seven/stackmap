[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$ProjectName,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$DomainName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-RequiredEnvironmentVariable {
    param([Parameter(Mandatory)][string]$Name)

    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, 'Process'))) {
        throw "Required environment variable '$Name' is not set."
    }
}

function Get-HttpStatusCode {
    param([Parameter(Mandatory)]$Exception)

    if ($null -eq $Exception.Response) {
        return $null
    }

    if ($Exception.Response.StatusCode -is [int]) {
        return [int]$Exception.Response.StatusCode
    }

    if ($null -ne $Exception.Response.StatusCode.value__) {
        return [int]$Exception.Response.StatusCode.value__
    }

    return [int]$Exception.Response.StatusCode
}

function Invoke-CloudflareApi {
    param(
        [Parameter(Mandatory)][ValidateSet('GET', 'POST')][string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        [Parameter()][string]$Body
    )

    $request = @{
        Method      = $Method
        Uri         = $Uri
        Headers     = @{ Authorization = "Bearer $script:ApiToken" }
        ContentType = 'application/json'
    }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $request.Body = $Body
    }

    try {
        $response = Invoke-RestMethod @request
    }
    catch {
        $statusCode = Get-HttpStatusCode -Exception $_.Exception
        if ($statusCode -in 401, 403) {
            throw 'Cloudflare authentication or authorization failed. Verify the API token and Pages permissions.'
        }
        if ($statusCode -eq 404) {
            throw "Cloudflare Pages project '$ProjectName' was not found in the configured account."
        }
        throw "Cloudflare Pages API request failed$(
            if ($null -ne $statusCode) { " with HTTP status $statusCode" }
        )."
    }

    if ($response.success -ne $true) {
        $messages = @($response.errors | ForEach-Object { $_.message }) -join '; '
        if ([string]::IsNullOrWhiteSpace($messages)) {
            $messages = 'Cloudflare returned an unsuccessful response.'
        }
        throw $messages
    }

    return $response
}

Assert-RequiredEnvironmentVariable -Name 'CLOUDFLARE_ACCOUNT_ID'
Assert-RequiredEnvironmentVariable -Name 'CLOUDFLARE_API_TOKEN'

$accountId = [Environment]::GetEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID', 'Process')
$script:ApiToken = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'Process')
$escapedAccountId = [Uri]::EscapeDataString($accountId)
$escapedProjectName = [Uri]::EscapeDataString($ProjectName)
$baseUri = "https://api.cloudflare.com/client/v4/accounts/$escapedAccountId/pages/projects/$escapedProjectName/domains"

Write-Host "Checking custom domains attached to Cloudflare Pages project '$ProjectName'..."
$domainsResponse = Invoke-CloudflareApi -Method GET -Uri $baseUri
$domainExists = @($domainsResponse.result | Where-Object {
        $_.name -ieq $DomainName
    }).Count -gt 0

if ($domainExists) {
    Write-Host "Custom domain '$DomainName' is already attached. No change was made."
    return
}

$body = @{ name = $DomainName } | ConvertTo-Json -Compress
$null = Invoke-CloudflareApi -Method POST -Uri $baseUri -Body $body
Write-Host "Custom domain '$DomainName' was attached to project '$ProjectName'."
Write-Host 'No direct DNS API changes were made by this script.'

