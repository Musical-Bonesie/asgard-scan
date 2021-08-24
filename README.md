# Asagrd-Scan

A mobile web app (view this app at width: 375px) that helps users with sensitive skin narrow down which ingredients might be causing irritation.

![Login](/server/public/images/login-page.png)

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

# Installation and Usage

- Clone the project via this Terminal command

- cd into project folder

- cd into both /client and /server folder and run npm install in each.

- Create a database (this project uses mySQL, Prisma, JavaScript) to connect to this project

* In Terminal, type mysql -u root -p to login as root user.
* In the mysql console, type: CREATE DATABASE asgardscanisawesome;

- Next install Prisma in the /server:

* npm install prisma --save-dev
* npx prisma

- In /server go to the .env file, add a value for:

* your JWT_SECRET env variable, choose any value.
  -Add a port number
* update the DATABASE_URL with your information:
  DATABASE_URL="mysql://yourname:randompassword@localhost:5432/mydbname?schema=public"

- In terminal:

* npx prisma migrate dev --name init
* Now you shuld be able to npm start in /server and /client to get the project up a running.

# Contact/Contributing:

- To connect and message me, feel free to go to my Linkedin:
- https://www.linkedin.com/in/signekurczaba/
