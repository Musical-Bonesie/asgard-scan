import likelySensitive from "../../assets/logo/high-likelyhood-text.svg";
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
        <img
          className="header__likelyImg"
          src={likelySensitive}
          alt="high likelyhood"
        />
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
        {/* TODO keep this section or not? <img src={likelySensitive} alt="high likelyhood" />
      <section className="header__likelyhood">
        <p className="header__ingredients">MODERATE LIKELYHOOD INGREDIENTS</p>
        <img
          className="header__alert-icon"
          alt="sensitive to icon"
          src={alertIcon}
        />
      </section> */}
      </header>
    )
  );
}
