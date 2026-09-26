# Lezioni sviluppo web

App per gestire le lezioni HTML/CSS del percorso e collegarle a Google Calendar.

## Setup

1. **Repo GitHub**: crea un repository, carica questi file, fai push su `main`.
   L'action in `.github/workflows/docker-build.yml` costruisce l'immagine e la pubblica su `ghcr.io/<tuo-utente>/lezioni-web`.
   Rendi il package pubblico da GitHub (Packages > lezioni-web > Package settings) o l'immagine non sarà scaricabile senza login.

2. **Client OAuth Google**: su [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   crea un "ID client OAuth" di tipo "App web". In "Origini JavaScript autorizzate" aggiungi:
   - `http://192.168.1.207:8091`
   - `http://10.147.12.1:8091`
   Copia il Client ID in `app/config.js` (`GOOGLE_CLIENT_ID`), poi fai di nuovo push.

3. **ZimaOS**: nell'installazione da compose incolla il contenuto di `docker-compose.yml`
   (o il link raw del file su GitHub). La porta esposta è `8091`, modificabile nel file.

## Note

- Lo stato delle lezioni (fatta/programmata/data) è salvato nel browser (localStorage), non nel server.
- Gli eventi creati vanno sul calendario primario del tuo account Google.
- Se cambi indirizzo di accesso in futuro, aggiungilo tra le origini autorizzate del client OAuth.
