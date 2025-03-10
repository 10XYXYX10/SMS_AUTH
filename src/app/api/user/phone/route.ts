import prisma from "@/lib/prisma";
import { generateRandomNumber6, security } from "@/lib/seculity/seculity";
import { rateLimit } from "@/lib/seculity/upstash";
import { validationForAuthenticationPassword, validationForPhoneNumber } from "@/lib/seculity/validation";
import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from 'bcrypt';
import { sendSmsAuth } from "@/lib/vonage/function";

export async function PUT(request: NextRequest) {
    try{
        //////////
        //■[ rateLimit ] ← 何度も更新されたら、vonageの利用料金が嵩むのでrateLimitで保護
        const rateLimitResult = await rateLimit()
        if(!rateLimitResult.success) return NextResponse.json( {message:rateLimitResult.message}, {status:429});

        //////////
        //■[ セキュリティー ]
        const {result,data,message} = await security();
        if(!result || !data)return NextResponse.json( {message}, {status:401});
        const userId = data.id;
    
        //////////
        //■[ request ]
        const requestBody = await request.json();
        const phoneNumber = requestBody.phoneNumber as string;
        if(!phoneNumber )return NextResponse.json( {message:`Bad request.`}, {status:400});

        //////////
        //■[ バリデーション ]
        //phoneNumber
        const validationResult = validationForPhoneNumber(phoneNumber);
        if( !validationResult.result)return NextResponse.json( {message:`Bad request.${validationResult.message}`}, {status:400});
                
        //////////
        //■[ 現在の電話番号の値と比較～同じなら更新不要 ]
        //・phoneNumber
        const checkUser = await prisma.user.findUnique({
            where:{
                id:userId
            }
        });
        if(!checkUser)return {errMsg:'Something went wrong.'};//checkUserの型を確定させる
        const headNumber7 = phoneNumber.slice(0,7);
        const lastNumber4 = phoneNumber.slice(-4);
        const hashedHeadNumber7 = checkUser.hashedPhoneNumber.slice(0,-4);
        const hashedLastNumber4 = checkUser.hashedPhoneNumber.slice(-4);
        if(lastNumber4===hashedLastNumber4){
            try{
                const result = await bcrypt.compare(headNumber7, hashedHeadNumber7);
                if(result)return {errMsg:'The same phone number as the one currently registered.'};
            }catch(err){
                throw err;
            }
        }

        //////////
        //■[ transaction ]
        await prisma.$transaction(async (prismaT) => {
            //////////
            //■[ SMS認証 ]
            //・6桁の乱数を生成
            const randomNumber6 = generateRandomNumber6();
            //・User の authenticationPassword & updatedAt を更新
            await prismaT.user.update({
                where:{id:userId},
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
        //■[ return ]
        return NextResponse.json({message:'succes!!'},{status:200});//response返してるから今回は200番で

    }catch(err){
        //////////
        //■[ return:失敗 ]
        const message = err instanceof Error ?  `${err.message}.` : `Internal Server Error.`;
        return NextResponse.json({ message }, {status:500});
    }
}

export async function PATCH(request: NextRequest) {
    try{
        //////////
        //■[ rateLimit ] ← 何度も更新されたら、vonageの利用料金が嵩むのでrateLimitで保護
        const rateLimitResult = await rateLimit()
        if(!rateLimitResult.success) return NextResponse.json( {message:rateLimitResult.message}, {status:429});

        //////////
        //■[ セキュリティー ]
        const {result,data,message} = await security();
        if(!result || !data)return NextResponse.json( {message}, {status:401});
        const userId = data.id;
    
        //////////
        //■[ request ]
        const requestBody = await request.json();
        const {phoneNumber,authenticationPassword} = requestBody;
        if(!phoneNumber || !authenticationPassword )return NextResponse.json( {message:`Bad request.`}, {status:400});

        //////////
        //■[ バリデーション ]
        //phoneNumber
        let validationResult = validationForPhoneNumber(phoneNumber);
        if( !validationResult.result)return NextResponse.json( {message:`Bad request.${validationResult.message}`}, {status:400});
        validationResult = validationForAuthenticationPassword(authenticationPassword); 
        if( !validationResult.result)return NextResponse.json( {message:`Bad request.${validationResult.message}`}, {status:400});
         
        //////////
        //■[ userチェック～経過時間の検証 ]
        const checkUser = await prisma.user.findUnique({
            where:{
              id:userId,
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
        if (elapsedMinutes >= 3)return { errMsg:'More than 3 minutes have passed. Please try again.'};

        //////////
        //■[ 電話番号を更新 ]
        //・値の調整＆ハッシュ化
        const headNumber7 = phoneNumber.slice(0,7);
        const endNumber4 = phoneNumber.slice(-4);
        const hashedPhoneNumber = await bcrypt.hash(headNumber7, 10) + endNumber4;
        //・更新
        await prisma.user.update({
            where:{id:userId},
            data:{
                hashedPhoneNumber
            }
        });

        //////////
        //■[ return:成功 ]
        return NextResponse.json({message:'Succes.'},{status:200});

    }catch(err){
        //////////
        //■[ return:失敗 ]
        const message = err instanceof Error ?  `${err.message}.` : `Internal Server Error.`;
        return NextResponse.json({ message }, {status:500});
    }
}