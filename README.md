# Asagrd-Scan

A mobile web app (view this app at width: 375px) that helps users with sensitive skin narrow down which ingredients might be causing irritation.

![Login](/server/public/images/login-page.png)
![Sign-up](/server/public/images/signup-page.png)

> **⚠️ Status: archived / not production-ready.**
> This is a 2021 bootcamp-era capstone. The backend (Heroku) is no longer running.
> Do not redeploy this code as-is — see [SECURITY.md](SECURITY.md) for the
> remediation record and the credential-rotation checklist.

- The previously published demo account has been retired. Use the sign-up flow to
  create an account against your own local database.

# Features

- User Auth: Password is hashed and encrypted before being saved into the database along with a unique token.

* Sign-Up to create an account that's saved in the database to gain access to the Home Page/Asgard Scan.

* Login: Using user Authentication to only allow valid users to gain access to the Home Page/Asgard Scan.

* User can add products that they know they aren't sensitive to and add products that they have had a negative reaction to. Ingredients (from the products the user has added) will be compared between the products they do not have sensitivities torward and products they have sensitivities/irritations from. Once the comparision is finished, the potential ingredients causing irritation will be returned and displayed at the top of the page (this may change as I refine the design of the page and add responsiveness across all sreen sizes).
  The more products the database has to compare for the user the more refined/accurate the suggested ingredients that might be causing sensitivities will be.

Note: The products the user adds to their "Sensitive To" and "Not Sensitive To" lists will be saved in the relational database to their user profile.

- Users can also initiate a product search for products that do not include specific ingredients by manually typing ingredients they would like to exclude (seperated by a comma ",") into the search bar:

ex/ water, coconut oil,

Once ingredients have been typed in, a list of products WITHOUT those ingredients will be displayed.
Currently a section that says "See More" will appear once ingredients have been typed into the search bar and the user can click on "See More" to view all suggested products without the ingredients they searched.

# Future Features

- Add responsiveness for all screen sizes
- Add a user profile where they can edit their profile and product lists
- User ability to manually add any product to their lists to save in the database.
- Add a scan feature so users can scan products with their mobile phone to add the ingredients, brand name, product name etc.. to their profile and database.

# Stack

- **Client:** React 18 + Vite (migrated off Create React App, which is
  deprecated and was the source of ~197 dependency advisories)
- **Server:** Express + Prisma 6 on MySQL
- **Tests:** Jest + Supertest (server), Vitest + Testing Library (client)

# Installation and Usage

1. Clone the project and `cd` into the project folder.

2. Install dependencies in each workspace:

   ```
   cd server && npm install
   cd ../client && npm install
   ```

3. Create the database (MySQL):

   ```
   mysql -u root -p
   CREATE DATABASE asgardscan;
   ```

4. Configure the server. Copy `server/.env.sample` to `server/.env` and set:

   - `JWT_SECRET` — generate a high-entropy value, do NOT pick a memorable
     string:

     ```
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```

     The server refuses to start without it rather than signing tokens with
     `undefined`.

   - `PORT` — e.g. `8080`
   - `CORS_ORIGINS` — comma-separated list of allowed browser origins, e.g.
     `http://localhost:3000`. The server no longer accepts every origin.
   - `DATABASE_URL` — e.g.
     `mysql://user:password@localhost:3306/asgardscan`

5. Configure the client. Copy `client/.env.sample` to `client/.env` and set
   `VITE_API_URL` to the server's URL. Vite only exposes `VITE_`-prefixed
   variables, and everything in that file is bundled into the JavaScript, so
   never put a secret there.

6. Run the migrations and start both halves:

   ```
   cd server && npx prisma migrate dev && npm run dev
   cd client && npm run dev
   ```

# Tests

```
cd server && npm test    # 27 tests: auth, authorization, token handling
cd client && npm test    #  6 tests: route guarding, API surface
```

# Contact/Contributing:

- To connect and message me, feel free to go to my Linkedin:
- https://www.linkedin.com/in/signekurczaba/
