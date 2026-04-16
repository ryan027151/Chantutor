import { Link } from "react-router-dom";


function NavBar(){
    return (
        <>
            <Link to="/">
                <button>Home</button>
            </Link>
            <Link to="/testtake">
                <button>Test take page</button>
            </Link>
        </>
    )
}

export default NavBar;