## Local HTTPS (Yahoo OAuth friendly)

Yahoo OAuth requires HTTPS callback URLs, so local development can run over TLS.

1. Install `mkcert` on macOS:

```zsh
brew install mkcert
mkcert -install
```

For Linux setup instructions, see the official guide:
[mkcert installation instructions](https://github.com/FiloSottile/mkcert#installation).

2. Generate a trusted local certificate (one-time or whenever needed):

```zsh
npm run cert:local
```

This command runs `scripts/gen-local-cert.sh`, which installs the local CA (if needed) and creates cert files for `localhost`.

3. Start Next.js with HTTPS:

```zsh
npm run dev:https
```

4. Open:

`https://localhost:3000`
