import { v4 as uuidv4 } from "uuid";

import add from "../../assets/logo/add-product.svg";
import "./YesProductsList.scss";

export default function YesProductsList({ handleClick, userYesProducts }) {
  // let product_id = userYesProducts;
  console.log(userYesProducts);

  //TODO now the the button works and goes to the handleClick function on hommePage.
  // Map through no_products map through no_products and if it was clicked --> gets added to the no_product array list of that user.
  //might have to create a yesproductHandleClick and a noproductHandleClick to track which products go to which list
  //
  return (
    <div className="card">
      {userYesProducts.map((product) => {
        let product_id = product.id;
        return (
          <div className="card__content" key={uuidv4()}>
            <img
              alt={product.productName}
              className="card__image"
              variant="top"
              src={product.image}
            />
            <img
              onClick={() => handleClick(product_id)}
              className="card__button"
              src={add}
              alt="add a yes product"
            />
            <div className="card__body">
              <h2 className="card__heading">
                {product.brandName} <br /> {product.productName}{" "}
              </h2>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// <Carousel variant="dark">
// <Carousel.Item>
//   <img
//     className="d-block w-100"
//     src={natreceutique}
//     alt="First slide"
//   />
//   <Carousel.Caption>
//     <div className="carousel__button-container">
//       <img
//         onClick={() => handleClick(item)}
//         className="carousel__button"
//         src={add}
//       />
//     </div>
//     <h5>Natreceutique</h5>
//     <p>Nulla vitae elit libero.</p>
//   </Carousel.Caption>
// </Carousel.Item>
// <Carousel.Item>
//   <img className="d-block w-100" src={ArganOil} alt="Second slide" />
//   <Carousel.Caption>
//     <div className="carousel__button-container">
//       <img className="carousel__button" src={add} />
//     </div>
//     <h5>All Things Jill</h5>
//     <p>Argan Oil</p>
//   </Carousel.Caption>
// </Carousel.Item>
// <Carousel.Item>
//   <img className="d-block w-100" src={AvaRose} alt="Third slide" />
//   <Carousel.Caption>
//     <div className="carousel__button-container">
//       <img className="carousel__button" src={add} />
//     </div>
//     <h5>Ava Isa SPF</h5>
//     <p>SPF your skin loves</p>
//   </Carousel.Caption>
// </Carousel.Item>
// </Carousel>
