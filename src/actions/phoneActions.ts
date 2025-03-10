'use server'

import prisma from "@/lib/prisma"
import { generateRandomNumber6, security } from "@/lib/seculity/seculity"
import { rateLimit } from "@/lib/seculity/upstash"
import { validationForAuthenticationPassword, validationForPhoneNumber } from "@/lib/seculity/validation"
import { sendSmsAuth } from "@/lib/vonage/function"
import * as bcrypt from 'bcrypt';

type EditPhoneState = {
    errMsg:string
}

export const getPhoneLastNumber = async({
    userId
 }:{
    userId:number
 }):Promise<{
    success:boolean
    errMsg?:string
    phoneLastNumber?:string
 }> => {
    try{
        //////////
        //■[ セキュリティー ]
        const {result,data,message} = await security();
        if(!result || !data)return {success:false, errMsg:message}
        const user = data;
        if(user.id != userId)return {success:false, errMsg:'No permission.'}//この認証は省略可
        //////////
        //■[ データ取得 ]
        const userData = await prisma.user.findUnique({
            where:{
                id:userId
            },
            select:{hashedPhoneNumber:true}
        });
        if(!userData)return {success:false, errMsg:'No permission.'}
        //////////
        //■[ データ整形 ]
        const {hashedPhoneNumber} = userData;
        const phoneLastNumber = hashedPhoneNumber.slice(-4);
        //////////
        //■[ return ]
        return {success:true,phoneLastNumber}

    }catch(err){
        const message = err instanceof Error ?  err.message : `Internal Server Error.`;
        return {success:false, errMsg:message}
    }
}

export const editPhoneFormAction = async (state: EditPhoneState, formData: FormData):Promise<EditPhoneState> => {
    try{

        //////////
        //■[ return(処理成功) ]
        if(1)return {errMsg:''};

        //////////
        //■[ rateLimit ] ← 何度も更新されたら、vonageの利用料金が嵩むのでrateLimitで保護
        // const {success,message} = await rateLimit()
        // if(!success) return {...state, errMsg:message};
        
        //////////
        //■[ セキュリティー ]
        const securityResult = await security();
        if(!securityResult.result || !securityResult.data)return {errMsg:securityResult.message}
        const user = securityResult.data;

        //////////
        //■[ formData ]
        // formDataから値を取得
        const phoneNumber = formData.get('phoneNumber') as string;
        // Required validation
        if (!phoneNumber) return {errMsg:'Bad request error.'};

        //////////
        //■[ validation ]
        //・phoneNumber
        const result = validationForPhoneNumber(phoneNumber);
        if(!result.result) return {errMsg:'Bad request error.'};

        // //////////
        // //■[ 現在の電話番号の値と比較～同じなら更新不要 ]
        // //・phoneNumber
        // const checkUser = await prisma.user.findUnique({
        //     where:{
        //         id:user.id
        //     }
        // });
        // if(!checkUser)return {errMsg:'Something went wrong.'};//checkUserの型を確定させる
        // const headNumber7 = phoneNumber.slice(0,7);
        // const lastNumber4 = phoneNumber.slice(-4);
        // const hashedHeadNumber7 = checkUser.hashedPhoneNumber.slice(0,-4);
        // const hashedLastNumber4 = checkUser.hashedPhoneNumber.slice(-4);
        // if(lastNumber4===hashedLastNumber4){
        //     try{
        //         const result = await bcrypt.compare(headNumber7, hashedHeadNumber7);
        //         if(result)return {errMsg:'The same phone number as the one currently registered.'};
        //     }catch(err){
        //         throw err;
        //     }
        // }

        //////////
        //■[ transaction ]
        await prisma.$transaction(async (prismaT) => {
            //////////
            //■[ SMS認証 ]
            //・6桁の乱数を生成
            const randomNumber6 = generateRandomNumber6();
            //・User の authenticationPassword & updatedAt を更新
            await prismaT.user.update({
                where:{id:user.id},
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
        return { errMsg:''};
        
    }catch(err){
        //////////
        //■[ return(処理失敗) ]
        return { errMsg:err instanceof Error ?  err.message : `Internal Server Error.`};
    }
};

export const editPhoneConfirm = async (
    phoneNumber:string,
    state: EditPhoneState,
    formData: FormData
 ):Promise<EditPhoneState> => {
    try{
        //////////
        //■[ return(処理成功) ]
        if(1)return { errMsg:''};
        //////////
        //■[ セキュリティー ]
        const securityResult = await security();
        if(!securityResult.result || !securityResult.data)return { errMsg:securityResult.message}
        const user = securityResult.data;
        
        //////////
        //■[ formDataから値を取得 ]
        // formDataから値を取得
        const authenticationPassword = formData.get('authenticationPassword') as string;
        // Required validation
        if(!authenticationPassword)return { errMsg:'Bad request error.'}

        //////////
        //■[ validation ]
        //・phoneNumber
        let result = validationForPhoneNumber(phoneNumber);
        if(!result.result) return { errMsg:'Bad request error.'};
        //・authenticationPassword
        result = validationForAuthenticationPassword(authenticationPassword);
        if(!result.result) return { errMsg:'Bad request error.'};

        //////////
        //■[ userチェック～経過時間の検証 ]
        const checkUser = await prisma.user.findUnique({
          where:{
            id:user.id,
            verifiedPhoneNumber:true,
          },
          select:{
            authenticationPassword:true,
            updatedAt:true,
          }
        });
        //Userが存在しない
        if(!checkUser)return { errMsg:`Something went wrong. Please try again.`};
        //認証パスワードが違う
        if(checkUser.authenticationPassword!==Number(authenticationPassword))return { errMsg:'Authentication password is incorrect.'};
        //経過時間の検証：3分以上経過していたらエラーとする
        const beforeTime = checkUser.updatedAt;
        const currentTime = new Date();
        const elapsedMilliseconds = currentTime.getTime() - beforeTime.getTime();// beforeTimeから現在の日時までの経過時間(ミリ秒単位)を計算
        const elapsedMinutes = elapsedMilliseconds / (1000 * 60);// 経過時間を分単位に変換
        if (elapsedMinutes >= 3){
          return { errMsg:'More than 3 minutes have passed. Please try again.'};
        }

        //////////
        //■[ 電話番号を更新 ]
        //・値の調整＆ハッシュ化
        const headNumber7 = phoneNumber.slice(0,7);
        const endNumber4 = phoneNumber.slice(-4);
        const hashedPhoneNumber = await bcrypt.hash(headNumber7, 10) + endNumber4;
        //・更新
        await prisma.user.update({
            where:{id:user.id},
            data:{
                hashedPhoneNumber
            }
        });
        
        //////////
        //■[ return(処理成功) ]
        return { errMsg:''};

    }catch(err){
        //////////
        //■[ return(処理失敗) ]
        return { errMsg:err instanceof Error ?  err.message : `Internal Server Error.`};
    }
}