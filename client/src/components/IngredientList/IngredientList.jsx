import alertIcon from "../../assets/logo/alert-icon.svg";
import { v4 as uuidv4 } from "uuid";
import "./IngredientList.scss";

export default function IngredientList({ sensitiveToIngredients }) {
  return (
    sensitiveToIngredients && (
      <header className="header">
        <h1 className="header__heading">
          WE THINK YOU MAY HAVE SENSITIVITIES TO:
        </h1>
        <h3 className="header__subheading">HIGH LIKELIHOOD</h3>
        {sensitiveToIngredients.map((ingredient) => {
          return (
            <section className="header__likelyhood" key={uuidv4()}>
              <p className="header__ingredients">{ingredient}</p>
              <img
                className="header__alert-icon"
                alt="sensitive to icon"
                src={alertIcon}
              />
            </section>
          );
        })}
      </header>
    )
  );
}
