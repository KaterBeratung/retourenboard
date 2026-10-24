# SMTP test certificates

Private keys are intentionally excluded from the public repository. The SMTP tests use an isolated loopback server and need a self-signed certificate for `localhost` and `127.0.0.1`. Generate a new disposable pair locally with OpenSSL:

```sh
mkdir -p .qa/smtp-test
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" -keyout .qa/smtp-test/smtp-key.pem -out .qa/smtp-test/smtp-cert.pem
RETOURENBOARD_TEST_SMTP_DIR="$PWD/.qa/smtp-test" npm test
```

In PowerShell, set `$env:RETOURENBOARD_TEST_SMTP_DIR=(Resolve-Path .qa/smtp-test).Path` before `npm test`. The PostgreSQL test requirements described in the project documentation also apply.

Alternatively, place your generated files in `tests/fixtures/` using those two filenames; both remain ignored by Git. Never reuse production certificates or keys, and never trust the test certificate in a system trust store. This environment variable affects test helpers only; it does not configure the application.
