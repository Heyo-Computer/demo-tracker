# Tracker App Demo
This project demostrates using claude skills to create a sandbox and deploy a simple application via the sandbox itself. 

## Getting started
```bash
# checkout TODO.md from the repo:
https://raw.githubusercontent.com/Heyo-Computer/demo-tracker/refs/heads/main/TODO.md

cat TODO.md
# Tracker App
The goal of this app is to track my hikes and capture the trail, milleage, dog friendly-ness, a basic rating, and an optional note. Assume date is today if left blank.

Todo items:
- [ ] create new JavaScript/HTML/CSS project
- [ ] use SSR
- [ ] bind to 0.0.0.0
- [ ] implement simple PIN based auth gate
- [ ] Simple KV JSON store on disk
- [ ] Allow simple form for entering in hike info
- [ ] List previous hikes

# if you don't have the CLI, signup at https://app.heyo.computer/signup
# install the CLI
curl -fsSL https://heyo.computer/heyvm/install.sh | sh
```

## Step 1: Install skills
```bash
# via the heyvm cli:
heyvm install-skills

# via skills.sh:
npx skills add heyo-computer/skills

```

## Step 2: Agent
Launch a coding agent in the project directory. 

I used the following prompt to create a simple JS app spec'd by TODO.md:
` Create a tracker app following the requirements in @TODO.md`

## Step 3: Test & Confirm
Ensure that the app runs and is functional `bun server.js` or similar cmd depending on what your agent created

## Step 4: Deploy
With Claude, use the `heyvm-deploy` skill to create a new sandbox on the Heyo cloud: 
`/heyvm-deploy create a new sandbox for the app using the public
  bun image and make the app publicly available`:
```
⏺ Bash(heyvm deploy /Users/samcurrie/sarocu/demo-tracker \
        --name tracker \…)
  ⎿  Step 1/3: Uploading archive...
     Archiving directory: /Users/samcurrie/sarocu/demo-tracker
       Excluded 1 directories: .git
     … +12 lines (ctrl+o to expand)
  ⎿  (timeout 5m)

⏺ Deployed. App is live at https://8r85yd.heyo.computer (PIN:
  1234).

✻ Worked for 2m 54s · 1 shell still running

⏺ Background command "Register bun image" completed (exit code 0)

⏺ Acknowledged.
```

We want to accomplish the following:
1. create a new sandbox on the EU or US region
1. Use the bun public image so that a JS toolchain is preinstalled
1. Mount the project files to the sandbox
1. Open a publicly accessible port 
1. Review the deployed app 
