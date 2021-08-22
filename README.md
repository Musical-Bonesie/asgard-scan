# Asagrd-Scan: My Capstone Project for BrainStation

A mobile app (view this app at width: 375px) that helps users with sensitive skin narrow down which ingredients might be causing irritation.

# Features

- Sign-Up to create an account that's saved in the database to gain access to the Home Page/Asgard Scan.

- Login: Using user Authentication to only allow valid users to gain access to the Home Page/Asgard Scan.

- User can add products that they know they aren't sensitive to and add products that they have had a negative reaction to. Ingredients (from the products the user has added) will be compared to the ingredeints from products they have not had sensitivities to and products they have had sensitivity/irritation from. Once the comparision is finished, the potential ingredients causing irritation will be returned and displayed at the top of the page (this may change as I refine the design of the page and add responsiveness across all sreen sizes).
  The more products the database has to compare for the user the more refined/acurate the suggested ingredients that might be causing sensitivities will be.

Note: The products the user adds to their Sensitive to and not Sensitive To lists will be saved in the relational database to their user profile.

- User can search for products without specific ingredients by typing ingredients (seperated by a comma ",") into the search bar:

ex/ water, coconut oil,

Once ingredients have been typed in, a list of products WITHOUT those ingredients will be displayed.
Currently a section that says "See More" will appear once ingredients have been typed into the search bar and the user can click on "See More" to view all suggested products without the ingredients they searched.

# Future Features

- Add responsiveness for all screen sizes

- Add a user profile where they can edit their profile and product lists
- Users can manually add any product to their lists to save in the database.
- Add a scan feature so users can scan products with their mobile phone to add the ingredients, brand name, product name etc.. to their profile and database.
