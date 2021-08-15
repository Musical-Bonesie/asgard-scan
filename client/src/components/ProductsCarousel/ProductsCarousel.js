import Carousel from "react-bootstrap/Carousel";
import natreceutique from "../../assets/images/natreceutique_be_light_01_small.svg";
import ArganOil from "../../assets/images/argan_oil.svg";
import AvaRose from "../../assets/images/ava_isa_rose_01.svg";
import add from "../../assets/logo/add-product.svg";
import "./ProductsCarousel.scss";

export default function ProductsCarousel({ handleClick }) {
  let item = "apple";

  //TODO now the the button works and goes to the handleClick function on hommePage.
  // Map through no_products map through no_products and if it was clicked --> gets added to the no_product array list of that user.
  //might have to create a yesproductHandleClick and a noproductHandleClick to track which products go to which list
  //
  return (
    <>
      <Carousel variant="dark">
        <Carousel.Item>
          <img
            className="d-block w-100"
            src={natreceutique}
            alt="First slide"
          />
          <Carousel.Caption>
            <div className="carousel__button-container">
              <img
                onClick={() => handleClick(item)}
                className="carousel__button"
                src={add}
              />
            </div>
            <h5>Natreceutique</h5>
            <p>Nulla vitae elit libero.</p>
          </Carousel.Caption>
        </Carousel.Item>
        <Carousel.Item>
          <img className="d-block w-100" src={ArganOil} alt="Second slide" />
          <Carousel.Caption>
            <div className="carousel__button-container">
              <img className="carousel__button" src={add} />
            </div>
            <h5>All Things Jill</h5>
            <p>Argan Oil</p>
          </Carousel.Caption>
        </Carousel.Item>
        <Carousel.Item>
          <img className="d-block w-100" src={AvaRose} alt="Third slide" />
          <Carousel.Caption>
            <div className="carousel__button-container">
              <img className="carousel__button" src={add} />
            </div>
            <h5>Ava Isa SPF</h5>
            <p>SPF your skin loves</p>
          </Carousel.Caption>
        </Carousel.Item>
      </Carousel>
    </>
  );
}
