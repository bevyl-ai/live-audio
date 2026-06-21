# Security

`@bevyl-ai/live-audio` runs in the browser and does not require Bevyl services.

## Reporting a Vulnerability

Please report security issues privately by emailing security@bevyl.ai.

Do not open a public GitHub issue for suspected vulnerabilities, credential
exposure, or provider-token handling bugs.

## Token Handling

Realtime transcription providers usually require short-lived browser tokens.
Applications should mint those tokens on their own server and pass only the
temporary token to the browser.

Do not hard-code provider API keys in client code.

## Data Handling

The package does not send audio to Bevyl. Audio leaves the browser only through
plugins or callbacks that the consuming application provides.
