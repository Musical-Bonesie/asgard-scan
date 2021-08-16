import { v4 as uuidv4 } from "uuid";

import add from "../../assets/logo/add-product.svg";
import "./YesSensitivity.scss";

export default function YesSensitivity({
  addProductSensitivity,
  yesSensitivity,
}) {
  //TODO now the the button works and goes to the handleClick function on hommePage.
  // Map through no_products map through no_products and if it was clicked --> gets added to the no_product array list of that user.
  //might have to create a yesproductHandleClick and a noproductHandleClick to track which products go to which list
  //
  return (
    <div className="cardSensitive">
      {yesSensitivity.map((product) => {
        let product_id = product.id;
        return (
          <div className="cardSensitive__content" key={uuidv4()}>
            <img
              alt={product.productName}
              className="cardSensitive__image"
              variant="top"
              src={product.image}
            />
            <img
              onClick={() => addProductSensitivity(product_id)}
              className="cardSensitive__button"
              src={add}
              alt="add a yes product"
            />
            <div className="cardSensitive__body">
              <h2 className="cardSensitive__heading">
                <strong>{product.brandName}</strong> <br />{" "}
                {product.productName}{" "}
              </h2>
            </div>
          </div>
        );
      })}
    </div>
  );
}

//TODO delete this  <Carousel variant="dark">
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
