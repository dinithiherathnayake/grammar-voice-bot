# Grammar Voice Bot - Netlify version

## Deploy (GitHub method)
1. Create a free account at github.com and make a new repository.
2. Upload ALL files of this folder to the repository (keep the folders: `public`, `netlify/functions`).
3. Create a free account at netlify.com.
4. Add new project -> Import an existing project -> GitHub -> choose your repository.
5. Leave the build command empty. Publish directory = `public` (already set in netlify.toml). Click Deploy.
6. Site configuration -> Environment variables -> Add a variable:
   - Key: `GEMINI_API_KEY`
   - Value: your key from aistudio.google.com
   - (Optional) Key: `GEMINI_MODEL`, Value: `gemini-3.5-flash-lite`  (this is already the default)
7. Deploys -> Trigger deploy -> Deploy site (so the key is picked up).
8. Open your https://xxxx.netlify.app link in Chrome or Edge and allow the microphone.

## Deploy (CLI method)
    npm install -g netlify-cli
    netlify login
    netlify init
    netlify env:set GEMINI_API_KEY your_key_here
    netlify deploy --prod

Never put your key in any file in this folder.
