'use client'
import { ChangeEvent, useActionState, useEffect, useState } from "react";
import AlertError from '@/components/AlertError';
import { validationForPhoneNumber } from "@/lib/seculity/validation";
import { editPhoneFormAction } from "@/actions/phoneActions";
import EditPhoneConfirm from "./EditPhoneConfirm";

export default function EditPhoneForm({
    phoneLastNumber
 }:{
    phoneLastNumber:string
 }) {
    const [state, formAction, isPending] = useActionState(
        editPhoneFormAction,
        {
            errMsg:'',
        }
    );
    const [phoneForm,setPhoneForm] = useState({
      phoneNumber:['',''],//[値,エラー文字]
    });
    const [processNum,setProcessNum] = useState<1|2>(1);

    useEffect(() => {
        //・phoneForm.phoneNumber[0]　← この判定が無いと初回レンダリング時に、processNumが2に更新されてしまう
        if(phoneForm.phoneNumber[0] && !state.errMsg && !isPending)setProcessNum(2);
    }, [isPending]);

    const handleChange = (e:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) => {
        const inputName = e.target.name;
        const inputVal = e.target.value;
        setPhoneForm({...phoneForm,[inputName]:[inputVal,'']})
    }

    const handleAction = (formData:FormData) => {
        ///////////
        //◆【formDataのバリデーション】
        const {phoneNumber} = phoneForm;
        //phoneNumber
        const result = validationForPhoneNumber(phoneNumber[0]);
        if( !result.result ){
            phoneNumber[1]=result.message;
            setPhoneForm({phoneNumber});
            return alert('入力内容に問題があります');
        }
        ///////////
        //■[ signInを実行 ]
        formAction(formData)
    }

    return (<>
        <div className="flex items-center justify-center mt-5">
            <div className="flex flex-col items-center justify-center w-full max-w-md">
                {processNum===1
                    ?(<> 
                        {state.errMsg && <AlertError errMessage={state.errMsg} reloadBtFlag={false}/>}
                        <form
                            action={handleAction}
                            className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 w-full max-w-md"
                        >
                            <div className="mb-4">
                                <label className='block text-gray-700 text-md font-bold'>日本の携帯電話番号<em>*</em></label>
                                <span className='text-xs text-gray-500'>xxx-xxxx-{phoneLastNumber}</span>
                                <input
                                    name='phoneNumber'
                                    type='text'
                                    defaultValue={phoneForm.phoneNumber[0]}
                                    onChange={handleChange}
                                    required={true}
                                    placeholder="09011112222"
                                    className={`
                                        ${phoneForm.phoneNumber[1]&&'border-red-500'} 
                                        bg-gray-100 shadow appearance-none break-all border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline
                                    `}
                                />
                                {phoneForm.phoneNumber[1] && <span className='text-red-500 text-xs italic'>{phoneForm.phoneNumber[1]}</span>}
                            </div>
                            <div className='flex items-center justify-between'> 
                                <button
                                    className={`
                                    bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline 
                                    ${isPending&&'cursor-not-allowed'}
                                    `}
                                    disabled={isPending}
                                    type="submit"
                                >
                                    {isPending ? '・・Loading・・' : 'Update'}
                                </button>
                            </div>
                        </form>
                    </> ):(
                        <EditPhoneConfirm phoneNumber={phoneForm.phoneNumber[0]} setProcessNum={setProcessNum}/>
                    )
                }
            </div>
        </div>

    </>)
}