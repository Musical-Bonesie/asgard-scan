import { v4 as uuidv4 } from "uuid";
import { PORT } from "../../utils/dataUtils";
import add from "../../assets/logo/add-product.svg";
import "./YesSensitivity.scss";

export default function YesSensitivity({ addProductSensitivity, products }) {
  //TODO now the the button works and goes to the handleClick function on HomePage.
  // add the functionality to get the product added to the correct users yes_sensitivity list in DB

  return (
    <div className="cardSensitive">
      {products.map((product) => {
        return (
          <div className="cardSensitive__content" key={uuidv4()}>
            <img
              alt={product.productName}
              className="cardSensitive__image"
              variant="top"
              src={`${PORT}${product.image}`}
            />
            <img
              onClick={() => addProductSensitivity(product)}
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
