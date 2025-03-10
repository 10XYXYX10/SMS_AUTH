import { getPhoneLastNumber } from "@/actions/phoneActions"
import EditPhoneForm from "./EditPhoneForm";

const EdidPhoneSc = async({
    userId
 }:{
    userId:number
 }) => {
    const { success,errMsg,phoneLastNumber} = await getPhoneLastNumber({userId});
    if(!success || !phoneLastNumber)throw new Error(errMsg ? errMsg : 'Something went wrong.');

    return <EditPhoneForm phoneLastNumber={phoneLastNumber}/>
}
export default EdidPhoneSc
