import { ReactNode } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faBookOpen, faBook, faChartLine, faHouse, faClock, faCircleUser, faArrowRightFromBracket, faCrown, faArrowRight, faArrowLeft} from '@fortawesome/free-solid-svg-icons';
import Logo from "./logo.tsx";

export const icons: Record<string, ReactNode> = {
    hamburger: (
        <FontAwesomeIcon icon={faBars} className="text-lg text-gray-700 hover:text-green-400" />
    ),
    practice : (
        <FontAwesomeIcon icon={faBookOpen} />
    ),
    test : (
        <FontAwesomeIcon icon={faBook} />
    ),
    performance: (
        <FontAwesomeIcon icon={faChartLine} />
    ),
    home : (
        <FontAwesomeIcon icon={faHouse} />
    ),
    clock: (
        <FontAwesomeIcon icon={faClock} className="text-lg"/>
    ),
    logo : (
        <FontAwesomeIcon icon={faCrown} className="text-center md:text-2xl text-amber-300" />
    ),
    user : (
        <FontAwesomeIcon icon={faCircleUser} />
    ),
    logout : (
        <FontAwesomeIcon icon={faArrowRightFromBracket} />
    ),
    arrowRight : (
        <FontAwesomeIcon icon={faArrowRight} className="text-sm"/>
    ),
    arrowLeft : (
        <FontAwesomeIcon icon={faArrowLeft} className="text-sm"/>
    )
};