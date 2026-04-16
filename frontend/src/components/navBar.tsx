import { Link } from "react-router-dom";


function NavBar(){
    return (
        <>
            <Link to="/home">
                <button>Home</button>
            </Link>
            <Link to="/mock">
                <button>Mocktest</button>
            </Link>
        </>
    )
}

export default NavBar;