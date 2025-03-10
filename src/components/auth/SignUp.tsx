import { ChangeEvent, useActionState, useState } from "react";
import AlertError from '../AlertError';
import { signUp } from '@/actions/authFunctions';
import SmsAuth from './SmsAuth';
import { validationForPassword, validationForPhoneNumber, validationForWord } from "@/lib/seculity/validation";

export default function SignUp() {
    const [state, formAction, isPending] = useActionState(
        signUp,
        {
            success:false,
            errMsg:'',
        }
    );
    const [signForm,setSignForm] = useState({
      name:['',''],//[値,エラー文字]
      phoneNumber:['',''],//[値,エラー文字]
      password:['','']//[値,エラー文字]
    });

    const handleChange = (e:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) => {
        const inputName = e.target.name;
        const inputVal = e.target.value;
        setSignForm({...signForm,[inputName]:[inputVal,'']})
    }

    const handleAction = (formData:FormData) => {
        ///////////
        //◆【formDataのバリデーション】
        const {name,phoneNumber,password} = signForm;
        //name
        let result = validationForWord(name[0]);
        if( !result.result )name[1]=result.message;
        //phoneNumber
        result = validationForPhoneNumber(phoneNumber[0]);
        if( !result.result )phoneNumber[1]=result.message;
        //password
        result = validationForPassword(password[0]);
        if( !result.result )password[1]=result.message;
        //name,phoneNumber,passwordのvalidation結果を反映
        if(name[1] || phoneNumber[1] || password[1]){
            setSignForm({name,phoneNumber,password});
            return alert('入力内容に問題があります');
        }
        ///////////
        //■[ signUpを実行 ]
        formAction(formData)
    }

    return (<>
        <div className="flex items-center justify-center mt-5">
            <div className="flex flex-col items-center justify-center w-full max-w-md">
                {!state.success
                    ?(<> 
                        {state.errMsg && <AlertError errMessage={state.errMsg} reloadBtFlag={false}/>}
                        <form
                            action={handleAction}
                            className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 w-full max-w-md"
                        >
                            <div className="mb-4">
                                <label className='block text-gray-700 text-md font-bold'>ユーザー名<em>*</em></label>
                                <span className='text-xs text-gray-500'>{`「< > % ;」`}は使用できません</span>
                                <input
                                    name='name'
                                    type='text'
                                    defaultValue={signForm.name[0]}
                                    onChange={handleChange}
                                    required={true}
                                    placeholder="ユーザー名"
                                    className={`
                                        ${signForm.name[1]&&'border-red-500'} 
                                        bg-gray-100 shadow appearance-none break-all border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline
                                    `}
                                />
                                {signForm.name[1] && <span className='text-red-500 text-xs italic'>{signForm.name[1]}</span>}
                            </div>
                            <div className="mb-4">
                                <label className='block text-gray-700 text-md font-bold'>日本の携帯電話番号<em>*</em></label>
                                <span className='text-xs text-gray-500'>11桁の携帯電話番号を入力して下さい</span>
                                <input
                                    name='phoneNumber'
                                    type='text'
                                    defaultValue={signForm.phoneNumber[0]}
                                    onChange={handleChange}
                                    required={true}
                                    placeholder="09011112222"
                                    className={`
                                        ${signForm.phoneNumber[1]&&'border-red-500'} 
                                        bg-gray-100 shadow appearance-none break-all border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline
                                    `}
                                />
                                {signForm.phoneNumber[1] && <span className='text-red-500 text-xs italic'>{signForm.phoneNumber[1]}</span>}
                            </div>
                            <div className="mb-6">
                                <label className='block text-gray-700 text-md font-bold'>パスワード<em>*</em></label>
                                <span className='text-xs text-gray-500 block'>5文字以上の半角の英数字を入力して下さい</span>
                                <input
                                    name='password'
                                    type='password'
                                    defaultValue={signForm.password[0]}
                                    onChange={handleChange}
                                    required={true}
                                    placeholder="パスワード"
                                    className={`
                                        ${signForm.password[1]&&'border-red-500'} 
                                        bg-gray-100 shadow appearance-none break-all border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline
                                    `}
                                />
                                {signForm.password[1] && <span className='text-red-500 text-xs italic'>{signForm.password[1]}</span>}
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
                                    {isPending ? '・・Loading・・' : 'SignUp'}
                                </button>
                            </div>
                        </form>
                    </> ):(
                        <SmsAuth phoneNumber={signForm.phoneNumber[0]} name={signForm.name[0]} typeValue={'SignUp'}/>
                    )
                }
            </div>
        </div>

    </>)
}