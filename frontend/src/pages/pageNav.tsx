import { Outlet } from "react-router-dom";
import NavBar from "../components/navBar";

function PageNav(){
    return (
        <>
            <NavBar/>
            <main>
                <Outlet></Outlet>
            </main>
        </>
    )
}

export default PageNav