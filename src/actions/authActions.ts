'use server'
import { validationForAuthenticationPassword, validationForPassword, validationForPhoneNumber, validationForWord } from "@/lib/seculity/validation";
import { generateRandomNumber6, saveAccessTokenInCookies, security } from "@/lib/seculity/seculity";
import { sendSmsAuth } from "@/lib/vonage/function";
import prisma from "@/lib/prisma";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { SignFormState, AuthUser} from "@/lib/types";
import * as bcrypt from 'bcrypt';
import { cookies } from "next/headers";
import { redirect } from 'next/navigation';
import { rateLimit } from "@/lib/seculity/upstash";

const phoneNumberOrPasswordErr = 'The value you entered is incorrect. Please try again.';//攻撃されることを想定し、どちらが間違っていたか予測がつかないように

export const loginCheck = async ():Promise<{
    success: boolean
    errMsg: string
    authUser?: AuthUser
}> => {
    try{
        //////////
        //■[ セキュリティー ]
        const {result,data,message} = await security();
        if(!result || !data)return {success:false, errMsg:message}

        //////////
        //■[ return ]
        return {success:true, errMsg:'', authUser:data}
    }catch(err){
        const message = err instanceof Error ?  err.message : `Internal Server Error.`;
        return {success:false, errMsg:message}
    }
}

//新規User作成
export const signUp = async (
    state: SignFormState, 
    formData: FormData
 ):Promise<SignFormState> => {
    try{
        //////////
        //■[ rateLimit ]
        const {success,message} = await rateLimit()
        if(!success) return {...state, errMsg:message};
        //return {success:false, errMsg:'XXX'};//テスト:rateLimit

        //////////
        //■[ formData ]
        // formDataから値を取得
        const name = formData.get('name') as string;
        const phoneNumber = formData.get('phoneNumber') as string;
        const password = formData.get('password') as string;
        // Required validation
        if (!name || !phoneNumber || !password) return {...state, errMsg:'Bad request error.'};

        //////////
        //■[ validation ]:正規ルート外からのリクエストに備えての保険
        //・name
        let result = validationForWord(name);
        if(!result.result) return {...state, errMsg:'Bad request error.'};
        //・phoneNumber
        result = validationForPhoneNumber(phoneNumber);
        if(!result.result) return {...state, errMsg:'Bad request error.'};
        //・password
        result = validationForPassword(password);
        if(!result.result) return {...state, errMsg:'Bad request error.'};

        //////////
        //■[ 不要データの削除 ]
        prisma.user.deleteMany({
            where: {
                verifiedPhoneNumber:false,
                createdAt: {
                    lt: new Date(Date.now() - 1000 * 60 * 4)//4分経過：認証パスワードの有効期限は3分
                }
            }
        }).catch((err)=>console.log(err.message));

        //////////
        //■[ password & phoneNumber をハッシュ化 ]
        //・password
        const hashedPassword = await bcrypt.hash(password, 11);
        //・phoneNumber
        const headNumber7 = phoneNumber.slice(0,7);
        const endNumber4 = phoneNumber.slice(-4);
        const hashedPhoneNumber = await bcrypt.hash(headNumber7, 11) + endNumber4;

        //////////
        //■[ 6桁の認証パスワードを生成 ]
        const randomNumber6 = generateRandomNumber6();

        //////////
        //■[ transaction ]
        await prisma.$transaction(async (prismaT) => {
            //新規User作成
            await prismaT.user.create({
                data: {
                    name,
                    hashedPhoneNumber,
                    hashedPassword,
                    verifiedPhoneNumber:false,
                    authenticationPassword:randomNumber6,
                },
            });
            //SMS認証番号を送信
            const {result,message} = await sendSmsAuth({
                phoneNumber,
                text: String(randomNumber6),
            });
            if(!result)throw new Error(message);
        },
        {
            maxWait: 10000, // default: 2000
            timeout: 25000, // default: 5000
        }).catch((err)=>{
            throw err;
        });
        
        //////////
        //■[ return(処理成功) ]
        return {success:true, errMsg:''};
        
    }catch(err){
        let errMsg = err instanceof Error ? err.message : `Internal Server Error.`;
        if (err instanceof PrismaClientKnownRequestError && err.code==='P2002') {// Unique制約違反のエラー
            errMsg = 'That name cannot be used. Please try another one.';
        }
        //////////
        //■[ return(処理失敗) ]
        return {...state, errMsg}
    }
};


//ログイン
export const signIn = async (
    state: SignFormState, 
    formData: FormData
 ):Promise<SignFormState> => {
    try{
        //////////
        //■[ rateLimit ]
        const {success,message} = await rateLimit()
        if(!success) return {...state, errMsg:message};
        
        //////////
        //■[ formData ]
        // formDataから値を取得
        const name = formData.get('name') as string;
        const phoneNumber = formData.get('phoneNumber') as string;
        const password = formData.get('password') as string;
        // Required validation
        if (!name || !phoneNumber || !password) return {...state, errMsg:'Bad request error.'};

        //////////
        //■[ validation ]:正規ルート外からのリクエストに備えての保険
        //・name
        let result = validationForWord(name);
        if(!result.result) return {...state, errMsg:'Bad request error.'};
        //・phoneNumber
        result = validationForPhoneNumber(phoneNumber);
        if(!result.result) return {...state, errMsg:'Bad request error.'};
        //・password
        result = validationForPassword(password);
        if(!result.result) return {...state, errMsg:'Bad request error.'};
    
        //////////
        //■[ 認証:phoneNumber,password ]
        //・phoneNumber
        const checkUser = await prisma.user.findFirst({
            where:{
                name,
                verifiedPhoneNumber:true
            }
        });
        if(!checkUser)return {...state, errMsg:phoneNumberOrPasswordErr}; 
        //・phoneNumber
        const headNumber7 = phoneNumber.slice(0,7);
        const lastNumber4 = phoneNumber.slice(-4);
        const hashedHeadNumber7 = checkUser.hashedPhoneNumber.slice(0,-4);
        const hashedLastNumber4 = checkUser.hashedPhoneNumber.slice(-4);
        if(lastNumber4!==hashedLastNumber4)return {...state, errMsg:phoneNumberOrPasswordErr};
        try{
            const result = await bcrypt.compare(headNumber7, hashedHeadNumber7);
            if(!result)return {...state, errMsg:phoneNumberOrPasswordErr};
        }catch(err){
            throw err;
        }
        //・password
        try{
            const result = await bcrypt.compare(password, checkUser.hashedPassword);
            if(!result)return {...state, errMsg:phoneNumberOrPasswordErr}
        }catch(err){
            throw err;
        }

        //////////
        //■[ 6桁の認証パスワードを生成 ]
        const randomNumber6 = generateRandomNumber6();

        //////////
        //■[ transaction ]
        await prisma.$transaction(async (prismaT) => {
            //////////
            //■[ SMS認証 ]
            //・User の authenticationPassword & updatedAt を更新
            await prismaT.user.update({
                where:{id:checkUser.id},
                data:{
                    authenticationPassword:randomNumber6,
                    updatedAt: new Date()
                }
            });
            //SMS認証番号を送信
            const sendSmsAuthResult = await sendSmsAuth({
                phoneNumber,
                text: String(randomNumber6),
            });
            if(!sendSmsAuthResult.result)throw new Error(sendSmsAuthResult.message);
        },
        {
            maxWait: 10000, // default: 2000
            timeout: 25000, // default: 5000
        }).catch((err)=>{
            throw err;
        });
        
        //////////
        //■[ return(処理成功) ]
        return {success:true, errMsg:''};
        
    }catch(err){
        //////////
        //■[ return(処理失敗) ]
        return {...state, errMsg:err instanceof Error ?  err.message : `Internal Server Error.`};
    }
};

//「signUp or signIn」→ メール認証
export const smsAuth = async (
    typeValue: 'SignUp'|'SignIn',
    state: {errMsg:string},
    formData: FormData
):Promise<{errMsg:string}> => {
    let userId:number = 0;
    try{
        //////////
        //■[ rateLimit ]
        // SMSメッセージの送信をするわけではないので、直接的な費用はかからない。
        // が、ブールトフォースなどで、無理やり認証を突破されても厄介なので、一応保護。
        const {success,message} = await rateLimit()
        if(!success) return {...state, errMsg:message};
        
        //////////
        //■[ formDataから値を取得 ]
        // formDataから値を取得
        const name = formData.get('name') as string;
        const authenticationPassword = formData.get('authenticationPassword') as string;
        // Required validation
        if(!name || !authenticationPassword)return {errMsg:'Bad request error.'}

        //////////
        //■[ validation ]:正規ルート外からのリクエストに備えての保険
        //・name
        let result = validationForWord(name);
        if(!result.result) return {errMsg:'Bad request error.'};
        //・authenticationPassword
        result = validationForAuthenticationPassword(authenticationPassword);
        if(!result.result) return {errMsg:'Bad request error.'};

        //////////
        //■[ userチェック～経過時間の検証 ]
        const checkUser = await prisma.user.findUnique({
          where:{
            name
          }
        });
        //Userが存在しない
        if(!checkUser)return {errMsg:`Something went wrong. Please try again.`};
        userId = checkUser.id;
        //ログインを試みたが、電話番号の認証が未完了
        if(typeValue=='SignIn' && !checkUser.verifiedPhoneNumber)return {errMsg:'That user is disabled. SMS authentication has not been completed.'};
        //認証パスワードが違う
        if(checkUser.authenticationPassword!==Number(authenticationPassword))return {errMsg:'Authentication password is incorrect.'};
        //経過時間の検証：3分以上経過していたらエラーとする
        const beforeTime = checkUser.updatedAt;
        const currentTime = new Date();
        const elapsedMilliseconds = currentTime.getTime() - beforeTime.getTime();// beforeTimeから現在の日時までの経過時間(ミリ秒単位)を計算
        const elapsedMinutes = elapsedMilliseconds / (1000 * 60);// 経過時間を分単位に変換
        if (elapsedMinutes >= 3){
          if(typeValue==='SignUp')await prisma.user.delete({where:{id:userId}});//User新規作成時、3分超過により認証が失敗した場合は、Userを削除
          return {errMsg:'More than 3 minutes have passed. Please try again.'};
        }

        //////////
        //■[ 新規作成時のSMS認証なら、verifiedPhoneNumber:true に更新 ]
        if(typeValue==='SignUp'){
            await prisma.user.update({
                where:{id:userId},
                data:{
                    verifiedPhoneNumber:true
                }
            });
        }

        //////////
        //■[ accessToken をサーバーサイドcookiesに保存 ]
        console.log({id:userId, name:checkUser.name})
        const savedResult = await saveAccessTokenInCookies({id:userId, name:checkUser.name});
        if(!savedResult.result)throw new Error(savedResult.message);
        
    }catch(err){
        //////////
        //■[ return(処理失敗) ]
        return {errMsg:err instanceof Error ?  err.message : `Internal Server Error.`};
    }

    //////////
    //■[ 処理成功時、リダイレクト ]
    //・redirectはtry-catchの外で実行することが推奨されている:https://nextjs.org/docs/app/building-your-application/routing/redirecting
    redirect(`/user/${userId}`);
}


export const signOut = async(state: string) => {
    try{
        //////////
        //■[ jwtをサーバーサイドcookieから削除 ]
        const accessToken = (await cookies()).get('accessToken');
        if(accessToken)(await cookies()).delete('accessToken');
    }catch(err){
        //////////
        //■[ return(処理失敗) ]
        state = err instanceof Error ?  err.message : `Internal Server Error.`
        return state;
    }
    
    //////////
    //■[ 処理成功時、リダイレクト ]
    //・redirectはtry-catchの外で実行することが推奨されている:https://nextjs.org/docs/app/building-your-application/routing/redirecting
    redirect('/auth');
} 

