# Garmin Carousel Downloader

App web para descargar el carrusel principal de productos Garmin.

Acepta:

- URLs completas de Garmin.
- SKUs sueltos, que se convierten automáticamente a la forma:
  `https://www.garmin.com/es-MX/p/0000000/pn/<SKU>/`

La salida principal es un ZIP descargable con carpetas por SKUs:

- `010-02969-02/01-cf-xl.jpg`
- `010-02969-02/02-rf-xl.jpg`

## Uso local

1. Instalá dependencias con `npm install`.
2. Iniciá la app con `npm run dev`.
3. Abrí `http://localhost:3000`.
4. Pegá URLs, SKUs, o ambos.

## Deploy en Cloud Run

La app incluye:

- `Dockerfile`
- `.github/workflows/main.yml`

El workflow quedó adaptado al estilo que ya usás:

- autentica con Workload Identity Federation,
- construye la imagen,
- la sube a `gcr.io`,
- y hace `gcloud run deploy` sobre un Cloud Run Service.

### Secretos de GitHub necesarios

- `SERVICE_ACCOUNT`

Ese secret debería valer algo como:

- `cloudrun@storage-entorno-de-desarrollo.iam.gserviceaccount.com`

### Variables ya cargadas en el workflow

Hoy el archivo usa estos valores:

- `PROJECT_ID: storage-entorno-de-desarrollo`
- `SERVICE_NAME: garmin-carousel-downloader`
- `REGION: us-central1`
- `WORKLOAD_IDENTITY_PROVIDER: projects/104248082609/locations/global/workloadIdentityPools/github/providers/github-provider-v2`

### Subir este proyecto a GitHub

1. Creá un repo vacío en GitHub.
2. En este proyecto corré:

```bash
git init
git branch -M master
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin master
```

Si este repo ya estaba inicializado, omití `git init`.

### Qué pasa después del push

Cada push a `master` dispara el workflow y despliega automáticamente en Cloud Run Service.

### Importante sobre Cloud Run Jobs vs Services

Para esta app usamos Cloud Run Service, no Cloud Run Job.

- Un Job corre tareas y termina.
- Un Service queda escuchando requests HTTP, que es justo lo que necesita esta web.

### Dónde se descargan los archivos para otro usuario

Cuando la app está publicada en Cloud Run, las imágenes no se guardan en una carpeta fija del servidor para el usuario final. La app genera un ZIP en la ejecución actual y el navegador del usuario lo descarga localmente, normalmente en su carpeta de descargas.

Eso está alineado con la forma en la que funciona Cloud Run, porque su filesystem es temporal y no persistente.

## Scripts

- `npm run dev`: inicia el servidor local.
- `npm test`: ejecuta los tests del parser.
