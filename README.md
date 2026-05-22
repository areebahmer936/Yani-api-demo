# Yani APIs Demo

Static frontend for the Auditvare database chat demo, with a server-side proxy for the upstream Yani API.

## Local run

Set the API key and start the local proxy:

```bash
export YANI_API_KEY="your-subscription-key"
python3 serve_yani_demo.py
```

Open `http://127.0.0.1:8000/`.

## Vercel deploy

Set this environment variable in Vercel:

- `YANI_API_KEY`

The frontend calls `/api/chat/database`, and Vercel forwards that request to the upstream API from the server side.