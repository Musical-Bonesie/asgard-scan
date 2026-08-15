import { useLocation, useNavigate, useParams } from "react-router-dom";

/**
 * react-router v6+ removed the injected `history`, `match` and `location`
 * props, and its hooks cannot be called from class components.
 *
 * This HOC restores just enough of the v5 shape (`this.props.history.push`)
 * for the existing class components to keep working, without rewriting them
 * all as function components.
 */
export default function withRouter(Component) {
  return function ComponentWithRouterProp(props) {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();

    const history = {
      push: (to) => navigate(to),
      replace: (to) => navigate(to, { replace: true }),
      goBack: () => navigate(-1),
    };

    return (
      <Component
        {...props}
        history={history}
        location={location}
        params={params}
        match={{ params }}
        navigate={navigate}
      />
    );
  };
}
