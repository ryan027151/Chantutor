import { useState } from 'react';
import { icons } from '../assets/icons.tsx'
import SideNavIcons from './sideNavIcons.tsx';
import { useNavigate } from "react-router-dom";
import { supabase } from '../supabase-client.ts';

export default function SideBar({className = ""}){
    const navigate = useNavigate();

    //need to replace with actual security checks
    async function adminCheck(){
        const { data: { user } } = await supabase.auth.getUser();
        if (user){
             const {data, error} = await supabase.from('profiles').select('role').eq('id', user.id)
             if (data && data[0].role == 'admin') {
                navigate("/admin")
             } 

             if (error){
                console.log(error);
                return;
             }
        }
    }
    
    
    

    return(
        <div className="flex flex-col justify-between py-4 top-0 h-screen md:w-48 w-12 bg-white">
            <div className="flex flex-col">
                {/* Main logo container */}
                <div className="flex items-center justify-start m-2 gap-3 md:w-40 w-auto px-2 pb-4  border-b">
                    {icons.logo}
                    <span>
                        <p className="text-sm md:inline hidden text-gray-500">Chan Tutoring</p>
                    </span>
                </div>

                {/* Main buttons container */}
                <div>
                    <SideNavIcons icon={icons.home} label={"Home"} onClick={() => navigate("/home")}></SideNavIcons>
                    <SideNavIcons icon={icons.practice} label={"Practice"} onClick={() => navigate("/practice")}></SideNavIcons>
                    <SideNavIcons icon={icons.performance} label={"Performance"} onClick={() => navigate("/home")}></SideNavIcons>
                    {<SideNavIcons icon={icons.table} label={"Adminstrator"} onClick={adminCheck}></SideNavIcons>}

                </div>
             </div>

            {/* Sign out container */}
            <div>
                <SideNavIcons icon={icons.logout} label={"Sign Out"} onClick={() => navigate("/")}></SideNavIcons>
            </div>

        </div>
    );
}