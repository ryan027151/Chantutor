import { icons } from '../assets/icons.tsx'
import SideNavIcons from './sideNavIcons.tsx';

export default function SideBar({className = ""}){
    return(
        <div className="flex flex-col justify-between py-4 top-0 h-screen md:w-48 w-12 bg-white">
            <div className="flex flex-col border-b">
                {/* Main logo container */}
                <div className="flex items-center justify-start m-2 gap-3 md:w-40 w-auto px-2 pb-4">
                    {icons.logo}
                    <span>
                        <p className="text-sm md:inline hidden text-gray-500">Chan Tutoring</p>
                    </span>
                </div>

                {/* Main buttons container */}
                <div>
                    <ul>
                        <SideNavIcons icon={icons.home} label={"Home"}></SideNavIcons>
                        <SideNavIcons icon={icons.test} label={"Mock Tests"}></SideNavIcons>
                        <SideNavIcons icon={icons.practice} label={"Practice"}></SideNavIcons>
                        <SideNavIcons icon={icons.performance} label={"Performance"}></SideNavIcons>
                    </ul>
                </div>
             </div>

            {/* Sign out container */}
            <div>
                <SideNavIcons icon={icons.user} label={"Profile"}></SideNavIcons>
                <SideNavIcons icon={icons.logout} label={"Sign Out"}></SideNavIcons>
            </div>

        </div>
    );
}